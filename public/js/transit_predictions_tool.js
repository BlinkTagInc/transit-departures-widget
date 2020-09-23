/* global $ */
/* eslint no-var: "off", sno-unused-vars: "off" */

function setupTransitPredictionsTool(routes) {
  $('#real_time_arrivals input[name="arrival_type"]').change(event => {
    const value = $(event.target).val();

    $('#route_form').toggleClass('d-none', value !== 'route');
    $('#stop_id_form').toggleClass('d-none', value !== 'stop_id');
  });

  $('#real_time_arrivals #arrival_route').change(event => {
    const routeId = $(event.target).val();

    $('#real_time_arrivals #arrival_stop')
      .val('')
      .prop('disabled', true);

    $('#real_time_arrivals #arrival_direction option:gt(0)').remove();
    $('#real_time_arrivals #arrival_stop option:gt(0)').remove();

    if (routeId === '') {
      $('#real_time_arrivals #arrival_direction')
        .val('')
        .prop('disabled', true);
    } else {
      $('#real_time_arrivals #arrival_direction')
        .val('')
        .prop('disabled', false);

      const route = routes.find(route => route.route_id === routeId);

      if (!route) {
        return console.warn(`Unable to find route ${routeId}`);
      }

      $('#real_time_arrivals #arrival_direction').append(route.directions.map(direction => {
        return $('<option>').val(direction.direction_id).text(direction.direction);
      }));
    }
  });

  $('#real_time_arrivals #arrival_direction').change(event => {
    const routeId = $('#real_time_arrivals #arrival_route').val();
    const directionId = $(event.target).val();

    $('#real_time_arrivals #arrival_stop option:gt(0)').remove();

    if (directionId === '') {
      $('#real_time_arrivals #arrival_stop')
        .val('')
        .prop('disabled', true);
    } else {
      $('#real_time_arrivals #arrival_stop')
        .val('')
        .prop('disabled', false);

      const route = routes.find(route => route.route_id === routeId);

      if (!route) {
        return console.warn(`Unable to find route ${routeId}`);
      }

      console.log(route)

      const direction = route.directions.find(direction => direction.direction_id.toString() === directionId);

      $('#real_time_arrivals #arrival_stop').append(direction.stops.map(stop => {
        return $('<option>').val(stop.stop_id).text(stop.stop_name);
      }));
    }
  });
}
